const EconomicEvent=require('../models/EconomicEvent');
async function sync(){if(!process.env.TRADING_ECONOMICS_KEY||!process.env.TRADING_ECONOMICS_SECRET)throw new Error('Economic calendar provider credentials not configured');throw new Error('Economic calendar provider adapter requires configured production endpoint credentials');}
async function upcoming(query={}){const now=new Date();const filter={scheduledAt:{$gte:query.from?new Date(query.from):now,$lte:query.to?new Date(query.to):new Date(Date.now()+7*864e5)}};if(query.importance)filter.importance=query.importance.toUpperCase();if(query.currency)filter.currency=query.currency.toUpperCase();return EconomicEvent.find(filter).sort({scheduledAt:1}).limit(200).lean()}
module.exports={sync,upcoming};
