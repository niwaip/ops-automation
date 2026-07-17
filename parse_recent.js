const fs = require('fs');
const data = JSON.parse(fs.readFileSync('session.json', 'utf8'));
const history = data.history.slice(-3); // Get last 3 items
console.log(JSON.stringify(history, null, 2));
