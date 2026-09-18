const mongoose=require('mongoose');
const schema=new mongoose.Schema({market:String,symbol:String,timeframe:String,price:Number,indicators:mongoose.Schema.Types.Mixed,source:String,observedAt:Date},{timestamps:true}); schema.index({symbol:1,timeframe:1,observedAt:-1});
module.exports=mongoose.models.MarketSnapshot||mongoose.model('MarketSnapshot',schema);
