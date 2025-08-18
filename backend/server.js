const app = require('./app'); 
const mongoose = require('mongoose');
require('dotenv').config();

const PORT = process.env.PORT || 3027;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected");
    app.listen(PORT, () => console.log(`Server running on ${PORT}`));
  })
  .catch(err => console.error(err));
