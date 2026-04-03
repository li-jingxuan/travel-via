import koaBody from 'koa-body'

const options = {
  multipart: true,
  urlencoded: true,
  json: true,
}

export const bodyParser = koaBody(options)
