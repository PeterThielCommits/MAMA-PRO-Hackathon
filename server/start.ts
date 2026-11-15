import { mkdirSync } from 'node:fs';
import { PilotService } from './service.ts';
import { createPilotServer, testOnly } from './http.ts';
testOnly();
mkdirSync('.pilot-test',{recursive:true,mode:0o700});
const databaseName=process.env.PILOT_DB_NAME??'pilot';
if(!/^[a-zA-Z0-9_-]{1,100}$/.test(databaseName))throw new Error('INVALID_TEST_DB_NAME');
const service=new PilotService(`.pilot-test/${databaseName}.sqlite`);
const server=createPilotServer(service,process.env.PILOT_MODE,process.env.NODE_ENV,process.env.PILOT_PUBLIC_DEMO);
const timer=setInterval(()=>{try{service.pump();}catch{console.error('PILOT_JOB_ERROR');}},1000);
const port=Number(process.env.PORT??8787);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('INVALID_PORT');
server.listen(port,'0.0.0.0',()=>console.log(`PILOT_TEST server :${port}; synthetic accounts only; LIVE_BLOCKED`));
function stop(){clearInterval(timer);server.close(()=>{service.store.db.close();process.exit(0);});}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
