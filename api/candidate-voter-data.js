export default async function handler(req,res){
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed"});}
  try{
    const auth=req.headers.authorization||"";
    if(!auth.startsWith("Bearer ")) return res.status(401).json({error:"Authentication required"});
    const base=(process.env.SUPABASE_URL||"https://ieoltipygxawhsvlxnsj.supabase.co").replace(/\/$/,"");
    const key=process.env.SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imllb2x0aXB5Z3hhd2hzdmx4bnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNDQyNTMsImV4cCI6MjEwNTgyMDI1M30.sqP5GY5or5TFHGHZn8F2ZwPWHjLv2f_p_K2js3z8KRk";
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