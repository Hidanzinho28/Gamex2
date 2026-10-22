'use strict';
const crypto = require('node:crypto');
const catalog = require('./catalog.cjs');
const states = Object.freeze({pending:'PENDING',paid:'COMPLETED',expired:'CANCELED',refunded:'REVERSED'});
class PaymentError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const invalid = () => new PaymentError(502, 'A PurinCash retornou dados de pagamento inconsistentes. Consulte o suporte antes de tentar novamente.');

function createService({env=process.env, fetcher=globalThis.fetch, clock=Date.now}={}) {
  function key() {
    const value = env.PURINCASH_API_KEY?.trim();
    if (!value) throw new PaymentError(503, 'Pagamento ainda não configurado. Cadastre PURINCASH_API_KEY na Vercel.');
    if(!/^ps_(live|test)_[A-Za-z0-9_-]+$/.test(value)) throw new PaymentError(503,'A chave PurinCash deve começar com ps_live_ ou ps_test_, sem aspas nem Bearer.');
    return value;
  }
  const secret = () => crypto.createHmac('sha256',key()).update('GameX PurinCash orders v1').digest();
  function seal(order) {
    const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv('aes-256-gcm',secret(),iv);
    const bytes=Buffer.concat([cipher.update(JSON.stringify(order),'utf8'),cipher.final()]);
    return 'gxp1_'+Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64url');
  }
  function open(token) {
    key();
    try {
      if(typeof token!=='string'||!/^gxp1_[A-Za-z0-9_-]{80,5000}$/.test(token)) throw Error();
      const bytes=Buffer.from(token.slice(5),'base64url');
      if(bytes.toString('base64url')!==token.slice(5)) throw Error();
      const cipher=crypto.createDecipheriv('aes-256-gcm',secret(),bytes.subarray(0,12));
      cipher.setAuthTag(bytes.subarray(12,28));
      const order=JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8'));
      if(order.v!==1||!Number.isSafeInteger(order.until)||order.until<=clock()||!validId(order.id)) throw Error();
      return order;
    } catch { throw new PaymentError(401,'O acesso a este pedido expirou ou a chave da loja foi alterada. Se já pagou, fale com o suporte e informe o número do pedido.'); }
  }
  function purchase(body) {
    key();
    if(!body || !Array.isArray(body.items)||!body.items.length||body.items.length>24) throw new PaymentError(400,'Carrinho vazio ou inválido.');
    if(typeof body.requestKey!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestKey)) throw new PaymentError(400,'Recarregue a página para iniciar o pagamento.');
    const email=typeof body.customer?.email==='string'?body.customer.email.trim().toLowerCase():'';
    const phone=typeof body.customer?.phone==='string'?body.customer.phone.replace(/\D/g,''):'';
    if(!/^[^\s|]+@[^\s|]+\.[^\s|]+$/.test(email)||email.length>254||!/^[0-9]{10,13}$/.test(phone)) throw new PaymentError(400,'Informe e-mail e telefone válidos.');
    const quantities=new Map();
    for(const item of body.items) {
      if(!item||!Object.hasOwn(catalog,item.id)||!Number.isInteger(item.qty)||item.qty<1||item.qty>10) throw new PaymentError(400,'Produto ou quantidade inválida.');
      const qty=(quantities.get(item.id)||0)+item.qty;
      if(qty>10) throw new PaymentError(400,'Limite de 10 unidades por produto.');
      quantities.set(item.id,qty);
    }
    const items=[...quantities].sort(([a],[b])=>a.localeCompare(b));
    const subtotal=items.reduce((total,[id,qty])=>total+Math.round(catalog[id].price*100)*qty,0);
    const coupon=['GAMEX','F0RCE','NASA'].includes(String(body.coupon||'').toUpperCase())?String(body.coupon).toUpperCase():'';
    const amount=Math.round(subtotal*(coupon?0.9:1));
    const digest=crypto.createHmac('sha256',secret()).update(JSON.stringify([body.requestKey,items,email,phone,coupon,amount])).digest();
    digest[6]=(digest[6]&15)|64;digest[8]=(digest[8]&63)|128;
    const hex=digest.subarray(0,16).toString('hex');
    const idempotencyKey=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    const orderId='GX-'+idempotencyKey;
    const description=`GameX ${orderId}`;
    const metadata=JSON.stringify({orderId,items:items.map(([id,qty])=>({id,qty})),coupon,email,phone,amountCents:amount});
    if(Buffer.byteLength(metadata,'utf8')>2048) throw new PaymentError(400,'Pedido muito grande. Divida os produtos em duas compras.');
    return {amount,description,metadata,email,orderId};
  }

  const sandbox=()=>key().startsWith('ps_test_');
  async function request(route,body) {
    const apiKey=key();let response,data;
    try {
      response=await fetcher('https://api.purincash.com/v1'+route,{
        method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(10000),
        headers:{Authorization:'Bearer '+apiKey,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
        ...(body?{body:JSON.stringify(body)}:{})
      });
    } catch { throw new PaymentError(502,'A conexão com a PurinCash falhou. Consulte a tentativa novamente; se já pagou, não pague outra vez.'); }
    try { data=await response.json(); } catch { throw new PaymentError(502,'A PurinCash não retornou uma resposta válida. Consulte esta tentativa antes de gerar outro Pix.'); }
    if(!response.ok||!data||typeof data!=='object'||Array.isArray(data)||data.error) {
      const hints={400:'Confira os dados do pedido e o valor mínimo configurado na PurinCash.',401:'A chave PurinCash não foi aceita. Confira a variável na Vercel.',403:'Confira a liberação da conta no painel PurinCash.',429:'Muitas consultas. Aguarde um pouco para tentar novamente.'};
      const error=new PaymentError(response.status===429?429:502,'PurinCash (HTTP '+response.status+'): '+(hints[response.status]||'Falha no provedor. Consulte o suporte antes de gerar outro Pix.'));
      // Somente rejeições explícitas permitem repetir uma criação. Timeout/5xx nunca são repetidos automaticamente.
      error.retrySafe=Boolean(body&&[400,401,403,429].includes(response.status));
      throw error;
    }
    return data;
  }
  function verify(data,order,creation=false) {
    if(!validId(data.paymentId)||!Number.isSafeInteger(data.amountCents)||data.amountCents!==order.amount||data.currency!=='BRL'||
      (order.id&&data.paymentId!==order.id)||!Object.hasOwn(states,data.status)||
      (data.environment!=null&&data.environment!==(sandbox()?'sandbox':'live'))) throw invalid();
    if(creation) {
      if(data.environment!==(sandbox()?'sandbox':'live')) throw invalid();
    } else if(data.metadata!==order.metadata||data.description!==order.description) throw invalid();
  }
  function clientOrder(order,data,pix) {
    return {provider:'purincash',sandbox:sandbox(),orderId:order.orderId,total:order.amount/100,subtotal:order.amount/100,fee:0,
      accessToken:seal(order),status:states[data.status],payment:{id:order.id,copyPaste:pix||'',expiresAt:data.expiresAt||null},
      ...(!pix&&data.status==='pending'?{recoveryMessage:'Localizamos a cobrança anterior, mas a consulta da PurinCash não fornece o código Pix novamente. Se já pagou, aguarde a confirmação. Caso contrário, fale com o suporte ou aguarde esta cobrança expirar.'}:{})};
  }
  async function recover(order) {
    // A API não documenta Idempotency-Key nem filtro por pedido. Consulta limitada aos 100 mais recentes.
    const result=await request('/charges?limit=100&offset=0');
    if(!Array.isArray(result.charges)) throw invalid();
    const matches=result.charges.filter(row=>row.description===order.description);
    if(matches.length!==1) throw new PaymentError(409,'Não foi possível localizar uma única cobrança desta tentativa. Confira no suporte antes de gerar outro Pix. Pedido '+order.orderId);
    const id=matches[0].paymentId;if(!validId(id)) throw invalid();
    const stored={...order,v:1,id,until:clock()+30*86400000};
    const data=await request('/charges/'+encodeURIComponent(id));verify(data,stored);
    return clientOrder(stored,data);
  }
  async function create(body) {
    const order=purchase(body);
    if(body.recoverOnly===true) return recover(order);
    const data=await request('/charges',{valueCents:order.amount,description:order.description,expiresIn:1800,
      customer:{email:order.email,externalId:order.orderId},metadata:order.metadata});
    verify(data,order,true);
    const stored={...order,v:1,id:data.paymentId,until:clock()+30*86400000};
    // Não aceitar confirmação de um POST: somente GET autenticado pode aprovar uma compra.
    if(data.status!=='pending') {const current=await request('/charges/'+encodeURIComponent(stored.id));verify(current,stored);return clientOrder(stored,current);}
    const expires=Date.parse(data.expiresAt||'');
    const pix=typeof data.pix?.brCode==='string'?data.pix.brCode.trim():'';
    if(!Number.isFinite(expires)||!(sandbox()?/^SANDBOX_PIX_[A-Za-z0-9_-]{1,500}$/.test(pix):/^000201[\x20-\x7e]{20,4090}$/.test(pix))) throw invalid();
    const total=pixTotal(pix);if(total!==null&&total!==order.amount) throw invalid();
    return clientOrder(stored,data,pix);
  }
  async function current(token) {
    const order=open(token),data=await request('/charges/'+encodeURIComponent(order.id));verify(data,order);
    return {status:states[data.status],id:order.id,orderId:order.orderId,sandbox:sandbox()};
  }
  return {create,current};
}
function validId(value) {return typeof value==='string'&&/^psc_[A-Za-z0-9_-]{1,156}$/.test(value);}
function pixTotal(code) {
  for(let offset=0;offset+4<=code.length;) {
    const tag=code.slice(offset,offset+2),length=code.slice(offset+2,offset+4);
    if(!/^\d{2}$/.test(tag)||!/^\d{2}$/.test(length)) return null;
    const end=offset+4+Number(length);if(end>code.length)return null;
    const value=code.slice(offset+4,end);
    if(tag==='54') return /^\d{1,7}\.\d{2}$/.test(value)?Math.round(Number(value)*100):null;
    offset=end;
  }
  return null;
}
module.exports={createService,PaymentError};
