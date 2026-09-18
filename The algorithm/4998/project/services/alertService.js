const crypto=require('crypto');const Alert=require('../models/Alert');
async function createAlert(data){const dedupeKey=crypto.createHash('sha256').update(JSON.stringify({u:String(data.userId),t:data.type,s:data.symbol||'',d:data.data||{}})).digest('hex');try{return await Alert.create({...data,dedupeKey})}catch(e){if(e.code===11000)return null;throw e}}
module.exports={createAlert};
