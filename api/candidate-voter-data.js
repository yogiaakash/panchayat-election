export default async function handler(req,res){
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed"});}
  try{
    const auth=req.headers.authorization||"";
    if(!auth.startsWith("Bearer ")) return res.status(401).json({error:"Authentication required"});
    const base=(process.env.SUPABASE_URL||"https://ieoltipygxawhsvlxnsj.supabase.co").replace(/\/$/,"");
    const key=process.env.SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||"sb_publishable_AzM0AxHgmX2a6-9On5jgNg_7SuasTXH";
    const authCheck=await fetch(base+"/auth/v1/user",{method:"GET",headers:{"Authorization":auth,"apikey":key}});\n    const authText=await authCheck.text();\n    if(!authCheck.ok) return res.status(401).json({error:"Supabase Auth rejected the login session",details:authText});\n    const authUser=JSON.parse(authText);\n    const r=await fetch(base+"/rest/v1/rpc/get_candidate_voters",{
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
    voters=Array.isArray(voters)?voters:[];
    const count=voters.length;
    const panchayatId=voters[0]?.panchayat_id||null;

    // Full voter details are unlocked only after a verified lifetime payment
    // for THIS logged-in user and THIS Panchayat. Never send unmasked fields
    // to a free browser session.
    let fullAccess=false;
    if(panchayatId && authUser?.id){
      const payUrl=base+"/rest/v1/lifetime_payment_records?select=id&user_id=eq."+encodeURIComponent(authUser.id)+"&panchayat_id=eq."+encodeURIComponent(panchayatId)+"&status=eq.paid&limit=1";
      const pr=await fetch(payUrl,{method:"GET",headers:{"Authorization":auth,"apikey":key,"Accept":"application/json"}});
      if(pr.ok){
        try{const pd=await pr.json();fullAccess=Array.isArray(pd)&&pd.length>0}catch{}
      }
    }

    const maskName=(value)=>{
      const s=String(value??"").trim();
      if(!s)return s;
      if(s.length<=2)return s[0]+"**";
      if(s.length===3)return s[0]+"**";
      return s.slice(0,2)+"**"+s.slice(-1);
    };
    const maskEpic=(value)=>{
      const s=String(value??"").trim();
      if(!s)return s;
      const slash=s.lastIndexOf("/");
      if(slash>=0 && s.length-slash>3){
        const tail=s.slice(slash+1);
        return s.slice(0,slash+1)+tail.slice(0,1)+"*****"+tail.slice(-2);
      }
      return s.length>5?s.slice(0,3)+"*****"+s.slice(-2):"*****";
    };
    const maskMobile=(value)=>{
      const s=String(value??"").trim();
      if(!s)return s;
      return s.length>4?s.slice(0,2)+"******"+s.slice(-2):"********";
    };

    if(!fullAccess){
      voters=voters.map(v=>({
        ...v,
        name:maskName(v.name),
        relative_name:maskName(v.relative_name),
        epic:maskEpic(v.epic),
        mobile_number:v.mobile_number?maskMobile(v.mobile_number):v.mobile_number
      }));
    }

    return res.status(200).json({
      success:true,
      full_access:fullAccess,
      access_level:fullAccess?"full":"masked",
      panchayat_id:panchayatId,
      master_count:count,
      voters,
      returned_count:count
    });
  }catch(e){
    return res.status(502).json({error:"Supabase proxy failed: "+(e?.message||String(e))});
  }
}