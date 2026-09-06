import { mkdir, writeFile } from 'node:fs/promises';
import { handleBilling } from '../src/lib/billing.js';

async function main() {
 const args=process.argv.slice(2);
 if(args.length>1){console.error('Usage: npm run ingest:billing -- [ACCOUNT_ID]');process.exitCode=2;return;}
 const env=Object.fromEntries(['EXPORT_API_KEY','CF_BILLING_API_TOKEN','CF_ALLOWED_ACCOUNT_IDS'].map(key=>[key,process.env[key]]));
 if(Object.values(env).some(value=>!value)){
  console.error('Billing ingestion pending: configure EXPORT_API_KEY, CF_BILLING_API_TOKEN and CF_ALLOWED_ACCOUNT_IDS in .dev.vars. No Cloudflare request was made.');process.exitCode=2;return;
 }
 const accountId=args[0]??env.CF_ALLOWED_ACCOUNT_IDS.split(',')[0].trim();
 const request=new Request(`https://ingestion.local/api/billing?${new URLSearchParams({accountId})}`,{headers:{Authorization:`Bearer ${env.EXPORT_API_KEY}`}});
 const response=await handleBilling(request,env);
 const snapshot=await response.json();
 if(!response.ok){console.error(`Billing ingestion failed: ${snapshot.error.code}`);process.exitCode=1;return;}
 await mkdir('.verification',{recursive:true,mode:0o700});
 const filename=`.verification/billing-${Date.now()}-${crypto.randomUUID()}.json`;
 await writeFile(filename,JSON.stringify(snapshot,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(`Saved ${snapshot.rows.length} billing rows (${snapshot.status}) to ${filename}. Live invoice reconciliation is still required.`);
 process.exitCode=snapshot.status==='available'?0:2;
}
main().catch(()=>{console.error('Billing ingestion could not complete. Check configuration and local report storage.');process.exitCode=1;});
