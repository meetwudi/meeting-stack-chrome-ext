import React, { useState, useEffect } from 'react'

interface AuthWrapperProps {
  children: React.ReactNode;
}

function AuthWrapper({ children }: AuthWrapperProps) {
  const [hasToken, setHasToken] = useState(false)

  useEffect(() => {
    checkAuthStatus()
  }, [])

  const checkAuthStatus = async () => {
    // First check storage
    const { token } = await chrome.storage.local.get('token')
    if (token) {
      setHasToken(true)
      return
    }

    // If no token in storage, check with identity API
    chrome.identity.getAuthToken({ 'interactive': false }, (token) => {
      if (token) {
        chrome.storage.local.set({ token })
        setHasToken(true)
      }
    })
  }

  const handleLogin = () => {
    chrome.identity.getAuthToken({ 'interactive': true }, async (token) => {
      if (token) {
        await chrome.storage.local.set({ token })
        setHasToken(true)
      }
    })
  }

  const handleLogout = () => {
    chrome.identity.getAuthToken({ 'interactive': false }, (token) => {
      if (token) {
        // Revoke token
        chrome.identity.removeCachedAuthToken({ token })
        // Remove from storage
        chrome.storage.local.remove('token')
        setHasToken(false)
      }
    })
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: 16
      }}>
      <h2>Meeting Stack</h2>
      {!hasToken ? (
        <button onClick={handleLogin}>Login</button>
      ) : 
        children
      }
    </div>
  )
}
 
export default AuthWrapper;