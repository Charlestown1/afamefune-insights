const levels={free:0,pro:1,pro_plus:2}; module.exports=min=> (req,res,next)=> levels[req.user?.plan||'free']>=levels[min]?next():res.status(403).json({error:`${min} plan required`});
