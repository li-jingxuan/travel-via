import { ChatContainer } from "../components/chat";

export default function Home() {
  return <div>
    <div className="h-[100vh] w-full flex m-8 border">
      <div className="w-[20vw] border"></div>
      <div className="flex-1">
        <ChatContainer />
      </div>
    </div>
  </div>;
}
