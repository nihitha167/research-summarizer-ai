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
  const [fileKey, setFileKey] = useState("");
  const [status, setStatus] = useState("");
  const [summary, setSummary] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const handleFileChange = (e) => {
    setFile(e.target.files[0] || null);
    setFileKey("");
    setSummary("");
    setStatus("");
  };

  // ------- 1) Upload to S3 via /upload -------- //
  const handleUpload = async () => {
    try {
      if (!file) {
        setStatus("Please choose a file first.");
        return;
      }

      setIsUploading(true);
      setStatus("Getting upload URL...");

      // Get Cognito JWT from Amplify
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        setStatus("Could not get auth token.");
        setIsUploading(false);
        return;
      }

      // Call /upload to get pre-signed URL
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

      // Upload file directly to S3 using the pre-signed URL
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

      setFileKey(fileKey);
      setStatus(`Upload complete! fileKey = ${fileKey}`);
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // ------- 2) Call /summarize with fileKey -------- //
  const handleSummarize = async () => {
    try {
      if (!fileKey) {
        setStatus("Please upload a file first so we have a fileKey.");
        return;
      }

      setIsSummarizing(true);
      setStatus("Generating summary...");

      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        setStatus("Could not get auth token.");
        setIsSummarizing(false);
        return;
      }

      const res = await fetch(`${API_BASE_URL}/summarize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ fileKey }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Summarize API error: ${res.status} ${text}`);
      }

      const data = await res.json();
      setSummary(data.summary || "No summary returned.");
      setStatus("Summary generated successfully.");
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <div className="app-root">
      <header
        className="app-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1rem 2rem",
        }}
      >
        <h1 style={{ margin: 0 }}>Research Summarizer AI</h1>
        <button onClick={signOut}>Sign Out</button>
      </header>

      <main
        className="app-main"
        style={{
          maxWidth: "900px",
          margin: "2rem auto",
          padding: "1.5rem",
        }}
      >
        <h2 style={{ marginBottom: "1.5rem" }}>
          Welcome, {user?.attributes?.email || "user"}
        </h2>

        {/* Upload section */}
        <section
          className="upload-section"
          style={{
            marginBottom: "2rem",
            padding: "1rem 1.5rem",
            borderRadius: "8px",
            background: "rgba(255, 255, 255, 0.04)",
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: "0.75rem" }}>
            1. Upload a research document
          </h3>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <input type="file" onChange={handleFileChange} />
            <button onClick={handleUpload} disabled={isUploading}>
              {isUploading ? "Uploading..." : "Upload to S3"}
            </button>
          </div>

          {fileKey && (
            <p style={{ marginTop: "0.75rem", fontSize: "0.9rem" }}>
              <strong>Stored fileKey:</strong> {fileKey}
            </p>
          )}
        </section>

        {/* Summarize section */}
        <section
          className="summarize-section"
          style={{
            marginBottom: "2rem",
            padding: "1rem 1.5rem",
            borderRadius: "8px",
            background: "rgba(255, 255, 255, 0.04)",
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: "0.75rem" }}>
            2. Summarize the uploaded document
          </h3>

          <button
            onClick={handleSummarize}
            disabled={!fileKey || isSummarizing}
            style={{ marginBottom: "1rem" }}
          >
            {isSummarizing ? "Summarizing..." : "Summarize file"}
          </button>

          {summary && (
            <div
              style={{
                marginTop: "0.5rem",
                padding: "0.75rem 1rem",
                borderRadius: "6px",
                background: "rgba(0, 0, 0, 0.3)",
                lineHeight: 1.5,
              }}
            >
              <strong>Summary:</strong>
              <p style={{ marginTop: "0.5rem" }}>{summary}</p>
            </div>
          )}
        </section>

        {status && (
          <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>{status}</p>
        )}
      </main>

      <footer
        className="app-footer"
        style={{ textAlign: "center", padding: "1rem 0 2rem" }}
      >
        <small>Built with React &amp; AWS</small>
      </footer>
    </div>
  );
}

export default App;
