import mongoose from 'mongoose'

export async function connectDB() {
  const uri = process.env.MONGO_URI
  if (!uri) {
    console.error('MONGO_URI is missing. Copy .env.example to .env and set it.')
    throw new Error('MONGO_URI is missing.')
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })
    console.log(`MongoDB connected: ${mongoose.connection.name}`)
  } catch (err) {
    console.error(`MongoDB connection failed: ${err.message}`)
    throw err
  }
}
