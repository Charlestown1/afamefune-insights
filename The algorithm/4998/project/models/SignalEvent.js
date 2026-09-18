const mongoose=require('mongoose');
const schema=new mongoose.Schema({signalId:{type:mongoose.Schema.Types.ObjectId,ref:'Signal',required:true},eventType:{type:String,enum:['CREATED','PUBLISHED','UPDATED','TP1_HIT','TP2_HIT','SL_HIT','CANCELLED','EXPIRED'],required:true},snapshot:{type:mongoose.Schema.Types.Mixed,required:true},actor:{type:mongoose.Schema.Types.ObjectId,ref:'User'},reason:String},{timestamps:true});
schema.index({signalId:1,createdAt:1}); module.exports=mongoose.models.SignalEvent||mongoose.model('SignalEvent',schema);
