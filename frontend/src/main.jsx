import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

import { Amplify } from "aws-amplify"
import awsconfig from "./aws-exports.js"

Amplify.configure(awsconfig) 
/*Amplify must be configured before any component uses authentication - This configuration step essentially tells your 
 frontend application where to find and how to interact with your backend authentication services.*/

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
