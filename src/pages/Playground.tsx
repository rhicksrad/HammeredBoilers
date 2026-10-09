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
      <section className="card playground-head">
        <h1 className="display">🍻 The Playground</h1>
        <p className="muted">General nonsense, any day of the week. Paste a GIF or image link and it shows up inline.</p>
        <p className="prompt">Today's prompt: <b>{prompt}</b></p>
      </section>
      <section className="card gp-chat tall">
        <Chat gameId={null} placeholder="Say something dumb…" />
      </section>
    </div>
  )
}
