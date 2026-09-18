function risk(event,currencies=[]){if(!event)return 'LOW';return event.importance==='HIGH'&&currencies.includes(event.currency)?'HIGH':event.importance==='HIGH'?'LOW':'LOW'} module.exports={risk};
