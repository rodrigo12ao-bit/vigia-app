export async function prepareImage(file: File) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10*1024*1024) throw new Error('Escolha uma imagem JPEG, PNG ou WebP de até 10 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas=document.createElement('canvas');
    const ratio=Math.min(1,1024/Math.max(bitmap.width,bitmap.height));
    canvas.width=Math.max(1,Math.round(bitmap.width*ratio)); canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
    const context=canvas.getContext('2d'); if(!context)throw new Error('Imagem indisponível.');
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    let result='';
    for (const quality of [.8,.6,.4,.25]) { result=canvas.toDataURL('image/jpeg',quality); if(result.length<=240000)break; }
    if(result.length>240000)throw new Error('A imagem continua grande demais. Escolha uma foto menor.');
    return {data:result.split(',')[1],mimeType:'image/jpeg',previewUrl:result};
  } finally { bitmap.close(); }
}
