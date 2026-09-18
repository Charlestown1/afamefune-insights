const mongoose=require('mongoose');
const schema=new mongoose.Schema({externalId:{type:String,unique:true},country:String,currency:String,event:String,category:String,importance:{type:String,enum:['LOW','MEDIUM','HIGH']},scheduledAt:Date,actual:String,forecast:String,previous:String,unit:String,source:String,status:{type:String,enum:['UPCOMING','RELEASED','REVISED'],default:'UPCOMING'},lastProviderUpdate:Date},{timestamps:true}); schema.index({scheduledAt:1,importance:1});
module.exports=mongoose.models.EconomicEvent||mongoose.model('EconomicEvent',schema);
