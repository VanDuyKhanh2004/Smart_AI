const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const { connectDatabase } = require('./configs/database');
const { testOpenAIConnection } = require('./utils/openai');
const { initializeSocketHandlers, getSocketStats, shutdownSocketIO } = require('./socket/socketHandler');

// Import routes
const productRoutes = require('./routes/productRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const authRoutes = require('./routes/authRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const compareRoutes = require('./routes/compareRoutes');
const qaRoutes = require('./routes/qaRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const addressRoutes = require('./routes/addressRoutes');
const profileRoutes = require('./routes/profileRoutes');
const promotionRoutes = require('./routes/promotionRoutes');
const storeRoutes = require('./routes/storeRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? process.env.FRONTEND_URL || "http://localhost:3000"
      : "*", // Allow all origins in development
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 5000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL || "http://localhost:3000"
    : "*", // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Serve test-chat.html for development
app.get('/test-chat', (req, res) => {
  res.sendFile(__dirname + '/test-chat.html');
});

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/compare', compareRoutes);
app.use('/api/questions', qaRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/appointments', appointmentRoutes);

// Serve static files for avatar uploads
app.use('/uploads/avatars', express.static(path.join(__dirname, 'uploads/avatars')));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      status: err.status || 500,
      timestamp: new Date().toISOString()
    }
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    error: {
      message: `Route ${req.originalUrl} not found`,
      status: 404,
      timestamp: new Date().toISOString()
    }
  });
});

initializeSocketHandlers(io);

const initializeServer = async () => {
  try {
    console.log('Starting Smart AI Backend...');
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    console.log('Connecting to MongoDB...');
    await connectDatabase();
    
    console.log('Testing external API connections...');
    
    // const [openaiOk] = await Promise.allSettled([
    //   testOpenAIConnection()
    // ]);

    // if (openaiOk.status === 'fulfilled' && openaiOk.value) {
    //   console.log('OpenAI API ready');
    // } else {
    //   console.warn('OpenAI API test failed');
    // }

    server.listen(PORT, () => {
      console.log('Smart AI Backend started successfully!');
      console.log(`Server running on port ${PORT}`);
      console.log(`Socket.IO ready for connections`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`API info: http://localhost:${PORT}/api/info`);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('\nDevelopment mode - Detailed logging enabled');
      }
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

initializeServer();

module.exports = { app, server, io };
