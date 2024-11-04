import React, { useState, useEffect } from 'react'

interface AuthWrapperProps {
  children: (logoutFn: () => void) => React.ReactNode;
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
    chrome.identity.getAuthToken({ 'interactive': false }, async (token) => {
      if (token) {
        try {
          // Revoke access from Google's OAuth server
          const response = await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
          if (!response.ok) {
            throw new Error('Failed to revoke token');
          }
          
          // Remove token from Chrome's cache
          await chrome.identity.removeCachedAuthToken({ token });
          // Clear all cached tokens
          await chrome.identity.clearAllCachedAuthTokens();
          // Remove from storage
          await chrome.storage.local.remove('token');
          setHasToken(false);
          window.location.reload();
        } catch (error) {
          console.error('Logout failed:', error);
        }
      }
    });
  };

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
        children(handleLogout)
      }
    </div>
  )
}
 
export default AuthWrapper;