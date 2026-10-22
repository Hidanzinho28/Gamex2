export function GET() {
  const configured=Boolean(process.env.PURINCASH_API_KEY?.trim());
  return Response.json({provider:'PurinCash',configured,paymentVerified:false,...(!configured?{missing:['PURINCASH_API_KEY']}:{})},
    {status:configured?200:503,headers:{'Cache-Control':'no-store'}});
}
