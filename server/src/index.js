// Local and Render entry point: connects to MongoDB, then listens on PORT.
import app, { connect } from './app.js'

const { PORT = 5000 } = process.env
const production = process.env.NODE_ENV === 'production'

try {
  await connect()
} catch {
  process.exit(1)
}
app.listen(PORT, () =>
  console.log(`Nepal Stay ${production ? 'site' : 'API'} listening on http://localhost:${PORT}`),
)
