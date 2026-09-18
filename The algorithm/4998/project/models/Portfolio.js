const mongoose=require('mongoose');
const schema=new mongoose.Schema({userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},name:{type:String,default:'Main Portfolio'},baseCurrency:{type:String,default:'USD'}},{timestamps:true}); schema.index({userId:1}); module.exports=mongoose.models.Portfolio||mongoose.model('Portfolio',schema);
