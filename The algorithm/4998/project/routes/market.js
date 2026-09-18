const router=require('express').Router();const scanner=require('../services/scanner');
router.get('/scan',async(_req,res)=>{const results=await scanner.scan();res.json({results,generatedAt:new Date().toISOString()} )});
router.get('/health',async(_req,res)=>res.json({status:process.env.TWELVE_DATA_API_KEY?'CONFIGURED':'UNCONFIGURED',providers:{twelveData:Boolean(process.env.TWELVE_DATA_API_KEY)},timestamp:new Date().toISOString()}));
module.exports=router;
