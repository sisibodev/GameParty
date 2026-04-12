import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { signOutUser } from '../firebase/auth'
import { GAMES } from '../data/games'
import type { GameMeta } from '../data/games'
import styles from './LobbyPage.module.css'

export default function LobbyPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOutUser()
    navigate('/login', { replace: true })
  }

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>🎮 게임 플랫폼</h1>
        <div className={styles.headerRight}>
          <span className={styles.userName}>{user?.displayName ?? user?.email}</span>
          <button className={styles.signOutButton} onClick={handleSignOut}>
            로그아웃
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>게임 목록</h2>
          <div className={styles.gameGrid}>
            {GAMES.filter((g) => g.enabled).map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

function GameCard({ game }: { game: GameMeta }) {
  const navigate = useNavigate()

  return (
    <div className={styles.card} onClick={() => navigate(game.path)}>
      <div className={styles.cardThumbnail}>{game.thumbnail}</div>
      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle}>{game.name}</h3>
        <p className={styles.cardDesc}>{game.description}</p>
        <div className={styles.cardMeta}>
          <span className={styles.cardPlayers}>👥 {game.players}</span>
          <div className={styles.cardTags}>
            {game.tags.map((tag) => (
              <span key={tag} className={styles.tag}>{tag}</span>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.cardFooter}>
        <button className={styles.playButton}>플레이</button>
      </div>
    </div>
  )
}
