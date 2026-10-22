# GameX — projeto completo com PurinCash

## Publicar na Vercel

1. Extraia o ZIP, abra a pasta GameX-PurinCash e envie TODO O CONTEÚDO dela para a raiz do repositório conectado à Vercel, preservando as pastas. Na raiz devem ficar package.json, vercel.json, public, api, lib e scripts.
2. Na Vercel, em Settings → Environment Variables, adicione PURINCASH_API_KEY com sua chave PurinCash. Cole somente a chave, sem aspas nem a palavra Bearer.
3. Para pagamentos reais, use a chave de produção que começa com ps_live_. A chave ps_test_ cria apenas cobranças simuladas; o site mostra um aviso de teste.
4. Salve e faça Redeploy. Uma atualização no GitHub conectado também pode iniciar o deploy; confirme que a variável está cadastrada antes da publicação que será usada.

Pode manter o mesmo projeto da Vercel. Configuração: Framework Other, raiz do repositório, build npm run build e Output Directory public. Esses valores já estão no vercel.json; confira se não existem configurações manuais antigas substituindo-os.

SÓ É NECESSÁRIA PURINCASH_API_KEY. Não precisa cadastrar produtos no gateway, banco de dados, domínio no código ou segredo de webhook. A confirmação é consultada pela API enquanto o checkout está aberto. BUKIOPAY_API_KEY e GOATPAY_API_KEY não são usadas neste pacote.

Gere sua chave em https://purincash.com/dashboard/api
Nunca publique a chave no GitHub nem nos arquivos da pasta public.

## Conteúdo preservado

Site completo, 24 produtos, cupons, três banners, estilo preto/branco/laranja, animações, avaliações, contatos e tag Google AW-18421173995 nas 28 páginas HTML.

O QR é gerado localmente usando exatamente pix.brCode da PurinCash. O servidor calcula os valores pelo catálogo e aplica 10% para GAMEX, F0RCE ou NASA. Preços enviados pelo navegador não alteram a cobrança.

## Conferir a configuração

Abra https://SEU-DOMINIO/api/health. configured: true significa que a variável está presente. Não comprova validade da chave, liberação da conta nem pagamento real concluído.

Para vender, use ps_live_ e conclua as exigências da conta PurinCash. Confira o valor mínimo configurado no painel: ele não pode superar o preço dos seus produtos.

## Pedidos e entrega

A confirmação usa consulta autenticada, conferindo ID, valor, moeda e os dados do pedido. O navegador recebe um recibo criptografado, nunca a chave API.

A ENTREGA DOS CRÉDITOS CONTINUA A CARGO DA EQUIPE GAMEX. Não há fornecedor de Robux integrado, envio automático de créditos nem envio de e-mails. Localize a cobrança pelo pedido GX-... no painel. O e-mail é enviado nos dados do cliente; itens, cupom, e-mail e telefone ficam também em metadata.

lib/catalog.cjs contém os códigos: r = Robux, vb = V-Bucks, vp = Valorant Points, d = Diamantes. Confira a confirmação no painel antes da entrega.

## Falhas de conexão

O Pix e o recibo ficam salvos no mesmo navegador. Depois de falha incerta, tentar novamente CONSULTA a tentativa anterior sem repetir automaticamente a criação.

A documentação não especifica Idempotency-Key para criar cobranças. A recuperação procura o pedido nas 100 cobranças mais recentes e valida os detalhes pela API. Se a resposta original foi perdida, a consulta documentada não fornece o QR novamente: o site acompanha o status e orienta procurar suporte ou aguardar a expiração. Se não localizar uma única cobrança, não gera outra automaticamente e orienta procurar suporte. Isso não substitui armazenamento persistente e bloqueio de concorrência no servidor para garantir criação única globalmente.

Rejeições explícitas de dados, chave ou limite de requisições permitem tentar criar novamente. Após status confirmado expired, é possível iniciar outro Pix. Se já pagou, não pague novamente por causa de erro de conexão. Cobranças antigas BukioPay devem ser conferidas no painel antigo.

Trocar a chave API invalida recibos anteriores. Quem já pagou deve informar o pedido ao suporte.

## Arquivos

- public/: todas as páginas e imagens; mantenha public/assets inteiro.
- api/: criação, consulta e diagnóstico.
- lib/purincash.cjs: integração no servidor.
- lib/catalog.cjs: catálogo de preços do servidor.
- scripts/: verificação executada no build.

Ao substituir a versão BukioPay, lib/bukiopay.cjs pode ser removido. Não altere preços somente no HTML: mantenha o catálogo do servidor correspondente.

## Validação

Testes locais com respostas simuladas: 24 produtos, cupons, campos oficiais, centavos, limites de descrição/metadata, QR decodificado, cópia e fallback, retomada, recuperação sem novo POST, aprovação, expiração, reembolso, sandbox, moeda/valor incorretos, recibo adulterado, chave alterada e falhas HTTP/rede.

Nenhuma cobrança real foi criada, nenhuma chave foi incluída e o pacote não foi publicado automaticamente. Confira um pagamento real após publicar com sua chave.

## Referências oficiais

- https://docs.purincash.com/guias/autenticacao
- https://docs.purincash.com/api-reference/cobrancas/create-charge
- https://docs.purincash.com/api-reference/cobrancas/get-charge
- https://docs.purincash.com/api-reference/cobrancas/list-charges
