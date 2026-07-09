const crypto = require('crypto');

const strWithColon = 'WX954R0ZCP-200:B9atkPEIWSEnnK54';
const strWithoutColon = 'WX954R0ZCP-200B9atkPEIWSEnnK54';

const hashWith = crypto.createHash('sha256').update(strWithColon).digest('hex');
const hashWithout = crypto.createHash('sha256').update(strWithoutColon).digest('hex');

console.log('With colon:', hashWith);
console.log('Without colon:', hashWithout);
