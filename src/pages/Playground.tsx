import { Lightbulb } from 'lucide-react'
import Chat from '../components/Chat'

const PROMPTS = [
  'Hot take: _____ is the most overrated tailgate food.',
  'Rank the Big Ten road trips. Go.',
  'Best Purdue upset you were there for?',
  'Who\'s the worst cornhole partner in the group? (Be honest.)',
  'Drop a GIF that describes last Saturday.',
]

export default function Playground() {
  const prompt = PROMPTS[new Date().getDate() % PROMPTS.length]
  return (
    <div className="stack-lg">
      <header className="page-head">
        <h1 className="display">Playground</h1>
        <p className="muted">The crew's group chat, any day of the week. Post a GIF or photo with the image button, paste one in, or drop a Giphy or Tenor link.</p>
      </header>
      <p className="playground-prompt"><Lightbulb size={17} aria-hidden="true" /><span>Today's prompt: <b>{prompt}</b></span></p>
      <section className="card gp-chat tall">
        <Chat gameId={null} placeholder="Say something dumb…" />
      </section>
    </div>
  )
}
