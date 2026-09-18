const mongoose=require('mongoose');
const schema=new mongoose.Schema({signalId:{type:mongoose.Schema.Types.ObjectId,required:true,unique:true},symbol:String,market:String,direction:String,timeframe:String,entry:Number,initialStopLoss:Number,tp1:Number,tp2:Number,exitPrice:Number,initialRisk:Number,resultR:Number,result:{type:String,enum:['WIN','LOSS','BREAKEVEN','PARTIAL'],required:true},closedAt:Date,strategyVersion:{type:String,default:'v1.0'},fingerprint:{type:String,required:true}},{timestamps:true});
module.exports=mongoose.models.SignalResult||mongoose.model('SignalResult',schema);
