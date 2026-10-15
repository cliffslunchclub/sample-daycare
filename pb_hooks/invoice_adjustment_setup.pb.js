// PocketHost hot-reloads hooks but may defer uploaded schema migrations until
// restart. Initialize the additive fields and the approved emailed reference
// without waiting for an administrator to make their next billing request.
cronAdd('preschool-invoice-reference-setup','* * * * *',()=>{
 try{require(__hooks+'/invoice-adjustments.js').ensure($app);}catch(_){$app.logger().error('Invoice reference setup could not complete; administrator billing setup will retry.');}
});
