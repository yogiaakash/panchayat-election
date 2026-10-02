export default async function handler(req,res){
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed"});}
  try{
    const auth=req.headers.authorization||"";
    if(!auth.startsWith("Bearer ")) return res.status(401).json({error:"Authentication required"});
    const base=(process.env.SUPABASE_URL||"https://ieoltipygxawhsvlxnsj.supabase.co").replace(/\/$/,"");
    const key=process.env.SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY;
    if(!key) return res.status(500).json({error:"Supabase API key is not configured on Vercel"});
    const r=await fetch(base+"/functions/v1/candidate-voter-data",{
      method:"POST",
      headers:{
        "Authorization":auth,
        "apikey":key,
        "Content-Type":"application/json"
      },
      body:JSON.stringify(req.body||{})
    });
    const text=await r.text();
    res.status(r.status).setHeader("Content-Type",r.headers.get("content-type")||"application/json").send(text);
  }catch(e){res.status(502).json({error:"Supabase proxy failed: "+(e?.message||String(e))});}
}