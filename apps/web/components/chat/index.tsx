
export const ChatContainer: React.FC = () => {
  return <>
    <div className="chat-container w-full h-full flex flex-col">
      <div className="chat-header h-16">
        <p className="pl-4">Travel Via - Your AI Travel Assistant</p>
      </div>
      <div className="chat-messages flex-1"></div>
      <div className="chat-input h-16 border-t p-4">
        <input type="text" placeholder="Type your message..." />
      </div>
    </div>
  </>
}
