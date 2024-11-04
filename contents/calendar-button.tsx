import type { PlasmoCSConfig } from "plasmo"

const CalendarButton = () => {
  const handleClick = () => {
    console.log("Button clicked")
    chrome.runtime.sendMessage({ type: "openStackRank" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error:", chrome.runtime.lastError)
      }
      console.log("Message sent, response:", response)
    })
  }

  return (
    <button 
      onClick={handleClick}
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        padding: "10px 20px",
        backgroundColor: "#1a73e8",
        color: "white",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
        zIndex: 9999
      }}
    >
      Open Stack Rank
    </button>
  )
}

export default CalendarButton

export const config: PlasmoCSConfig = {
  matches: ["https://calendar.google.com/*"]
} 