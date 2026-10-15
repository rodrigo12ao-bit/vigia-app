import express,{type Express,type RequestHandler,type ErrorRequestHandler} from 'express';

export const apiResponseHeaders:RequestHandler=(_request,response,next)=>{
  response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  next();
};

export function installApiBoundary(app:Express,limiter:RequestHandler){
  app.use('/api',apiResponseHeaders);
  app.use('/api',limiter);
  // Reject excess requests before spending memory/CPU parsing their JSON body.
  app.use(express.json({limit:'2mb'}));
}

export const publicRequestError:ErrorRequestHandler=(error,_request,response,_next)=>{
  response.status(error.status&&error.status<500?error.status:503).json({status:'unavailable',error:error.type==='entity.too.large'?'Conteúdo grande demais.':'Não foi possível processar a solicitação.'});
};
