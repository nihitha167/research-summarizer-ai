import {Authenticator} from "@aws-amplify/ui-react"
import "@aws-amplify/ui-react/styles.css"
import './App.css'

function App() {
  // authentictor automatically - shows sign-up page, sends vertification email, shows login page, authenticates the user, stores JWT, protect inner pages.
  return (
    <Authenticator>
      {({signOut, user}) => (
        <div className="app-root">
          <header className="app-header">
            <h1>Research Summarizer AI</h1>
            <button onClick={signOut}>Sign Out</button>
          </header>

         <main className="app-main">
          <h2>
            Welcome,{" "}
            {user?.signInDetails?.loginId ?? user?.username}
          </h2>
          <p>
            Your Cognito user ID:{" "}
            {user?.userId ?? user?.username}
          </p>
      </main>


          <footer className="app-footer">
            <small>Built with react & AWS</small>
          </footer>
        </div>
     )}
    </Authenticator>
  )
}


export default App
