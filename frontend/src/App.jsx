// src/App.jsx
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import "./App.css";
import { API_BASE_URL } from "./config";
import { fetchAuthSession } from "aws-amplify/auth";
import { useState, useEffect } from "react";

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

  const [historyItems, setHistoryItems] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [deletingFileKey, setDeletingFileKey] = useState("");

  const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5 MB in bytes

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    
    if (selectedFile) {
      const fileSizeMB = (selectedFile.size / 1024 / 1024).toFixed(2);
      
      // Check file size
      if (selectedFile.size > MAX_FILE_SIZE) {
        setStatus(`File too large (${fileSizeMB} MB). Maximum size is 4.5 MB. Please compress your PDF or choose a smaller file.`);
        setFile(null);
        e.target.value = ''; // Reset file input
        return;
      }
      
      setFile(selectedFile);
      setStatus("");
    } else {
      setFile(null);
      setStatus("");
    }
    
    setFileKey("");
    setSummary("");
  };

  // Helper: get Cognito ID token from Amplify
  const getIdToken = async () => {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString();
    if (!idToken) {
      throw new Error("Could not get auth token.");
    }
    return idToken;
  };

  // ------- 1) Upload to S3 via /upload -------- //
  const handleUpload = async () => {
    try {
      if (!file) {
        setStatus("Please choose a file first.");
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
        setStatus(`File too large (${fileSizeMB} MB). Maximum size is 4.5 MB.`);
        return;
      }

      setIsUploading(true);
      setStatus("Uploading...");

      const idToken = await getIdToken();

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
        throw new Error(`Upload failed: ${res.status}`);
      }

      const data = await res.json();
      const { uploadUrl, fileKey } = data;

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
      setStatus("");
      
      // Auto-trigger summarize after successful upload
      handleSummarizeAfterUpload(fileKey, idToken);
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
      setIsUploading(false);
    }
  };

  // Auto-summarize after upload
  const handleSummarizeAfterUpload = async (key, token) => {
    try {
      setIsSummarizing(true);
      setStatus("Generating summary...");

      const res = await fetch(`${API_BASE_URL}/summarize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fileKey: key }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Summarize failed: ${res.status}`);
      }

      const data = await res.json();
      setSummary(data.summary || "No summary returned.");
      setStatus("Summary generated successfully!");
      
      // Refresh history
      setTimeout(() => {
        fetchHistory();
        setStatus("");
      }, 2000);
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    } finally {
      setIsSummarizing(false);
      setIsUploading(false);
    }
  };

  // ------- 2) Load /history -------- //
  const fetchHistory = async () => {
    try {
      setIsLoadingHistory(true);

      const idToken = await getIdToken();

      const res = await fetch(`${API_BASE_URL}/history?limit=20`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`History API error: ${res.status}`);
      }

      const data = await res.json();
      setHistoryItems(data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // ------- 3) Delete item -------- //
  const handleDelete = async (keyToDelete) => {
    const confirmed = window.confirm(
      "Delete this summary and its file?"
    );
    if (!confirmed) return;

    try {
      setDeletingFileKey(keyToDelete);

      const idToken = await getIdToken();
      
      console.log("Deleting key:", keyToDelete);
      
      // Use POST with body instead of DELETE with path parameter
      const deleteUrl = `${API_BASE_URL}/delete-item`;
      console.log("POST DELETE URL:", deleteUrl);
      
      const res = await fetch(deleteUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ fileKey: keyToDelete }),
      });

      console.log("Response status:", res.status);

      // Try to parse response
      let responseData;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        responseData = await res.json();
      } else {
        responseData = { message: await res.text() };
      }
      
      console.log("Delete response:", res.status, responseData);

      if (!res.ok) {
        throw new Error(`Delete failed: ${res.status} - ${JSON.stringify(responseData)}`);
      }

      // Success! Remove from local state
      setHistoryItems((items) =>
        items.filter((item) => item.fileKey !== keyToDelete)
      );
      
      // Clear summary if it matches the deleted item
      if (summary && historyItems.find(item => item.fileKey === keyToDelete)?.summary === summary) {
        setSummary("");
      }
      
      setStatus("Item deleted successfully!");
      setTimeout(() => setStatus(""), 3000);
    } catch (err) {
      console.error("Delete error:", err);
      alert(`Error deleting item: ${err.message}`);
      setStatus(`Error: ${err.message}`);
    } finally {
      setDeletingFileKey("");
    }
  }; // <-- THIS WAS MISSING!

  // Load history once on mount
  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getFileNameFromKey = (key) => {
    if (!key) return "";
    const parts = key.split("/");
    const fullName = parts[parts.length - 1] || key;
    // Remove timestamp prefix (e.g., "1763359780193-")
    return fullName.replace(/^\d+-/, "");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", color: "#e5e7eb" }}>
      {/* Header */}
      <header
        style={{
          background: "rgba(15, 20, 35, 0.95)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          padding: "1.25rem 2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 600, color: "#ffffff" }}>
          Research Summarizer
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <span style={{ fontSize: "0.9rem", color: "#9ca3af" }}>
            {user?.attributes?.email}
          </span>
          <button
            onClick={signOut}
            style={{
              background: "rgba(255, 255, 255, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              padding: "0.5rem 1.25rem",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.9rem",
              color: "#e5e7eb",
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: "1400px", margin: "0 auto", padding: "3rem 2rem" }}>
        {/* Status Message */}
        {status && (
          <div
            style={{
              padding: "1rem 1.5rem",
              marginBottom: "2rem",
              borderRadius: "8px",
              background: status.includes("Error") || status.includes("too large")
                ? "rgba(239, 68, 68, 0.15)"
                : status.includes("successfully")
                ? "rgba(34, 197, 94, 0.15)"
                : "rgba(59, 130, 246, 0.15)",
              border: status.includes("Error") || status.includes("too large")
                ? "1px solid rgba(239, 68, 68, 0.4)"
                : status.includes("successfully")
                ? "1px solid rgba(34, 197, 94, 0.4)"
                : "1px solid rgba(59, 130, 246, 0.4)",
              color: status.includes("Error") || status.includes("too large")
                ? "#fca5a5"
                : status.includes("successfully")
                ? "#86efac"
                : "#93c5fd",
              fontSize: "0.95rem",
            }}
          >
            {status}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
          {/* Left Column - Upload & Summary */}
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            {/* Upload Section */}
            <section
              style={{
                background: "rgba(15, 20, 35, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "12px",
                padding: "2rem",
              }}
            >
              <h2 style={{ margin: "0 0 1rem 0", fontSize: "1.25rem", fontWeight: 500, color: "#f3f4f6" }}>
                Upload Document
              </h2>
              <p style={{ margin: "0 0 1.5rem 0", color: "#9ca3af", fontSize: "0.95rem" }}>
                Upload a PDF or text file (max 4.5 MB) to generate an AI summary
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf,.txt"
                  style={{
                    padding: "0.75rem",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "6px",
                    color: "#e5e7eb",
                    cursor: "pointer",
                  }}
                />
                <button
                  onClick={handleUpload}
                  disabled={!file || isUploading || isSummarizing}
                  style={{
                    padding: "0.875rem 1.5rem",
                    background: (!file || isUploading || isSummarizing)
                      ? "rgba(59, 130, 246, 0.3)"
                      : "rgba(59, 130, 246, 0.8)",
                    border: "none",
                    borderRadius: "6px",
                    color: "#ffffff",
                    fontSize: "1rem",
                    fontWeight: 500,
                    cursor: (!file || isUploading || isSummarizing) ? "not-allowed" : "pointer",
                    opacity: (!file || isUploading || isSummarizing) ? 0.5 : 1,
                  }}
                >
                  {isUploading
                    ? "Uploading..."
                    : isSummarizing
                    ? "Generating Summary..."
                    : "Upload & Summarize"}
                </button>
              </div>
            </section>

            {/* Summary Display */}
            {summary && (
              <section
                style={{
                  background: "rgba(15, 20, 35, 0.6)",
                  border: "1px solid rgba(34, 197, 94, 0.3)",
                  borderRadius: "12px",
                  padding: "2rem",
                }}
              >
                <h2 style={{ margin: "0 0 1rem 0", fontSize: "1.25rem", fontWeight: 500, color: "#f3f4f6" }}>
                  Summary
                </h2>
                <div
                  style={{
                    fontSize: "0.95rem",
                    lineHeight: "1.7",
                    color: "#d1d5db",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {summary}
                </div>
              </section>
            )}
          </div>

          {/* Right Column - History */}
          <section
            style={{
              background: "rgba(15, 20, 35, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "12px",
              padding: "2rem",
              maxHeight: "calc(100vh - 200px)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1.5rem",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 500, color: "#f3f4f6" }}>
                History
              </h2>
              <button
                onClick={fetchHistory}
                disabled={isLoadingHistory}
                style={{
                  padding: "0.5rem 1rem",
                  background: "rgba(255, 255, 255, 0.1)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "6px",
                  color: "#e5e7eb",
                  cursor: isLoadingHistory ? "wait" : "pointer",
                  fontSize: "0.85rem",
                }}
              >
                {isLoadingHistory ? "Loading..." : "Refresh"}
              </button>
            </div>

            {historyItems.length === 0 && !isLoadingHistory ? (
              <p style={{ color: "#6b7280", textAlign: "center", padding: "2rem 0" }}>
                No documents yet. Upload your first document to get started.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  overflowY: "auto",
                  paddingRight: "0.5rem",
                }}
              >
                {historyItems.map((item) => (
                  <article
                    key={item.fileKey + item.createdAt}
                    style={{
                      padding: "1rem",
                      background: "rgba(0, 0, 0, 0.3)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "8px",
                      transition: "all 0.2s",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(0, 0, 0, 0.4)";
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(0, 0, 0, 0.3)";
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "1rem",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }} onClick={() => setSummary(item.summary || "")}>
                        <div
                          style={{
                            fontWeight: 500,
                            fontSize: "0.95rem",
                            marginBottom: "0.25rem",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: "#f3f4f6",
                          }}
                        >
                          {getFileNameFromKey(item.fileKey)}
                        </div>
                        <div
                          style={{
                            fontSize: "0.8rem",
                            color: "#6b7280",
                            marginBottom: "0.5rem",
                          }}
                        >
                          {new Date(item.createdAt).toLocaleDateString()} at{" "}
                          {new Date(item.createdAt).toLocaleTimeString()}
                        </div>
                        <div
                          style={{
                            fontSize: "0.85rem",
                            color: "#9ca3af",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {item.summaryPreview}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.fileKey);
                        }}
                        disabled={deletingFileKey === item.fileKey}
                        style={{
                          padding: "0.4rem 0.75rem",
                          background: "rgba(239, 68, 68, 0.2)",
                          border: "1px solid rgba(239, 68, 68, 0.4)",
                          borderRadius: "4px",
                          color: "#fca5a5",
                          cursor: deletingFileKey === item.fileKey ? "wait" : "pointer",
                          fontSize: "0.8rem",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {deletingFileKey === item.fileKey ? "..." : "Delete"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;