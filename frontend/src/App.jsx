import { useState } from 'react'
import './App.css'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  return (
    <div className="app-root">
      <header className="app-header">
        <h1>Research Summarizer AI</h1>
        {isLoggedIn && (
          <button className="link-button" onClick={()=> setIsLoggedIn(false)}>Sign Out</button>
        )}
      </header>

      <main className="app-main">
        {!isLoggedIn ? (<AuthPlaceholder onLogin={() => setIsLoggedIn(true)} /> ) : (<DashboardPlaceholder/>)}
      </main>

      <footer className="app-footer">
        <small>Built with react & AWS</small>
      </footer>
    </div>
  )
}

function AuthPlaceholder({onLogin}){
  return(
    <section className='card'>
      <h2>Welcome</h2>
      <p>This app lets you securely upload research PDFs and get AI summaries + Q&A, per user.</p>
      <p> In the next step, this area will become the real sign up / sign in experience using Amazon Cognito.</p>
      <button className="primary-button" onClick={onLogin}>Fake Sigin (for now)</button>
    </section>
  )
}

function DashboardPlaceholder(){
  return(
    <section className='card'>
      <h2>Your Dashboard</h2>
      <p>after backend</p>
      <ul>
        <li>Upload PDF / DOCX / TXT files</li>
        <li>Request AI summaries + 5 Q&A pairs</li>
        <li>View your past summaries</li>
        <li>Delete files and summaries for privacy</li>
      </ul>
      <p> In Phase 3, this will call real API Gateway + Lambda + Bedrock.</p>
      </section>
  )
}

export default App
