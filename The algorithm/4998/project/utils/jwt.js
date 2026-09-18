const jwt=require('jsonwebtoken');
function secret(){if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32) throw new Error('JWT_SECRET must be at least 32 characters'); return process.env.JWT_SECRET;}
exports.signToken=u=>jwt.sign({id:String(u._id),role:u.role,plan:u.plan},secret(),{algorithm:'HS256',expiresIn:'7d'});
exports.verifyToken=t=>jwt.verify(t,secret(),{algorithms:['HS256']});
