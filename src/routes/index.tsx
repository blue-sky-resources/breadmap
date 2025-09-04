import { createFileRoute } from '@tanstack/react-router'
import { GoogleMap } from '../components/GoogleMap'

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center',
        padding: '20px'
      }}>
        <div>
          <h2>Google Maps API Key Required</h2>
          <p>Please add your Google Maps API key to the environment variables.</p>
          <p>Create a <code>.env</code> file in the root directory and add:</p>
          <code style={{ 
            background: '#f5f5f5', 
            padding: '10px', 
            borderRadius: '4px',
            display: 'block',
            margin: '10px 0'
          }}>
            VITE_GOOGLE_MAPS_API_KEY=your_api_key_here
          </code>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', width: '100vw', margin: 0, padding: 0 }}>
      <GoogleMap 
        apiKey={apiKey}
        center={{ lat: 39.7392, lng: -104.9903 }}
        zoom={12}
      />
    </div>
  )
}
