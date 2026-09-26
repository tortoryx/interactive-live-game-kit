// Fixed provider adapter: input data can never select an endpoint or install tools.
export const DEEPSEEK_MODEL=process.env.DEEPSEEK_MODEL||'deepseek-flash';
export function deepseekRequest(request){
 const shape=request.text?.format?.schema;
 if(!shape||!Array.isArray(request.input))throw Error('invalid_context');
 return {model:DEEPSEEK_MODEL,thinking:{type:'disabled'},stream:false,
  max_tokens:Math.min(2048,request.max_output_tokens||1024),
  response_format:{type:'json_object'},
  messages:request.input.map(m=>({role:m.role,content:m.content+(m.role==='system'?`\nReturn exactly one JSON object matching this JSON Schema. Include every required field; no extra fields, markdown, tools or commentary.\n${JSON.stringify(shape)}${shape.properties?.lines?.items?.properties?.text?.maxLength===24?'\n长度是硬性要求：每个text最多24个字符，标点也算。每条只讲一个意思，不把多个分句塞进一条。句数遵守JSON Schema，少于上限也可以，不为凑数续句。写完检查长度，超出就改写成短句。':''}`:'')}))};
}
