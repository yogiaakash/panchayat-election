export default async function handler(req,res){
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed"});}
  try{
    const auth=req.headers.authorization||"";
    if(!auth.startsWith("Bearer ")) return res.status(401).json({error:"Authentication required"});
    const base=(process.env.SUPABASE_URL||"https://ieoltipygxawhsvlxnsj.supabase.co").replace(/\/$/,"");
    const key=process.env.SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||"sb_publishable_AzM0AxHgmX2a6-9On5jgNg_7SuasTXH";
    const r=await fetch(base+"/rest/v1/rpc/get_candidate_voters",{
      method:"POST",
      headers:{
        "Authorization":auth,
        "apikey":key,
        "Content-Type":"application/json",
        "Accept":"application/json"
      },
      body:"{}"
    });
    const text=await r.text();
    if(!r.ok) return res.status(r.status).json({error:"Supabase voter RPC failed ("+r.status+")",details:text});
    let voters=[];
    try{voters=JSON.parse(text)}catch{}
    const count=Array.isArray(voters)?voters.length:0;
    return res.status(200).json({
      success:true,
      voters:Array.isArray(voters)?voters:[],
      returned_count:count
    });
  }catch(e){
    return res.status(502).json({error:"Supabase proxy failed: "+(e?.message||String(e))});
  }
}