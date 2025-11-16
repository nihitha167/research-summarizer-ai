// src/App.jsx
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import "./App.css";
import { API_BASE_URL } from "./config";
import { fetchAuthSession } from "aws-amplify/auth";
import { useState } from "react";

function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => <AuthenticatedApp signOut={signOut} user={user} />}
    </Authenticator>
  );
}

function AuthenticatedApp({ signOut, user }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");

  const handleFileChange = (e) => {
    setFile(e.target.files[0] || null);
  };

  const handleUpload = async () => {
    try {
      if (!file) {
        setStatus("Please choose a file first.");
        return;
      }

      setStatus("Getting upload URL...");

      // 1) Get Cognito JWT from Amplify
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        setStatus("Could not get auth token.");
        return;
      }

      // 2) Call /upload to get pre-signed URL
      const res = await fetch(`${API_BASE_URL}/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Upload API error: ${res.status} ${text}`);
      }

      const data = await res.json();
      const { uploadUrl, fileKey } = data;

      setStatus("Uploading file to S3...");

      // 3) Upload file directly to S3 using the pre-signed URL
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!putRes.ok) {
        throw new Error(`S3 upload failed: ${putRes.status}`);
      }

      setStatus(`Upload complete! fileKey = ${fileKey}`);
      // Later we'll call /summarize with this fileKey.
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div className="app-root">
      <header className="app-header">
        <h1>Research Summarizer AI</h1>
        <button onClick={signOut}>Sign Out</button>
      </header>

      <main className="app-main">
        <h2>Welcome, {user?.attributes?.email || "user"}</h2>

        <section className="upload-section">
          <h3>Upload a research document</h3>
          <input type="file" onChange={handleFileChange} />
          <button onClick={handleUpload}>Upload to S3</button>
          {status && <p>{status}</p>}
        </section>
      </main>

      <footer className="app-footer">
        <small>Built with React & AWS</small>
      </footer>
    </div>
  );
}

export default App;
