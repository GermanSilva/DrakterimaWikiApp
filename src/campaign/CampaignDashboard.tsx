import { useCampaign } from './CampaignContext'
import { BannerBackdrop } from './dashboard/BannerBackdrop'
import { Greeting } from './dashboard/Greeting'
import { MyCharacterCard } from './dashboard/MyCharacterCard'
import { DmNewsCard, PlayerNewsCard } from './dashboard/NewsCard'
import { NextSessionCard } from './dashboard/NextSessionCard'
import { NotesCard } from './dashboard/NotesCard'
import { PartyStrip } from './dashboard/PartyStrip'
import { PrepCard } from './dashboard/PrepCard'
import { useDashboardModel } from './dashboard/useDashboardModel'

/** Landing page of a campaign, "Mi mesa": what matters to the viewer's role, over the campaign banner. */
export function CampaignDashboard() {
  const { campaign } = useCampaign()
  // the last visit is read once per mount: a new campaign gets a fresh panel
  return <Panel key={campaign.id} />
}

function Panel() {
  const { campaign, isDM, myCharacterIds } = useCampaign()
  const m = useDashboardModel()
  const greetingStatus = isDM ? m.prepStatus : m.newsStatus
  return (
    <div className="relative">
      <BannerBackdrop branding={campaign.branding} />
      <div className="relative">
        <h1 className="sr-only">Panel de campaña</h1>
        <Greeting name={m.greetingName} isDM={isDM} count={isDM ? m.prep.length : m.news.unreadCount} status={greetingStatus} />
        <div className="grid max-w-[1120px] grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-3 max-[1100px]:grid-cols-1">
          <div className="flex flex-col gap-3">
            <NextSessionCard slug={campaign.slug} isDM={isDM} next={m.next} status={m.nextStatus} />
            {isDM ? (
              <PrepCard slug={campaign.slug} items={m.prep} status={m.prepStatus} />
            ) : (
              m.mine && <MyCharacterCard slug={campaign.slug} pj={m.mine} system={m.system} regionLabel={m.regionLabel(m.mine.region)} economy={m.economy} />
            )}
            <PartyStrip slug={campaign.slug} party={m.party} myCharacterIds={myCharacterIds} system={m.system} status={m.partyStatus} />
          </div>
          <div className="flex flex-col gap-3">
            {isDM ? (
              <DmNewsCard slug={campaign.slug} notes={m.noteFeed} notesStatus={m.noteFeedStatus} changes={m.sheetChanges} changesStatus={m.sheetChangesStatus} onMarkRead={m.visit.markRead} />
            ) : (
              <PlayerNewsCard slug={campaign.slug} entries={m.news.entries} status={m.newsStatus} onMarkRead={m.visit.markRead} />
            )}
            <NotesCard slug={campaign.slug} isDM={isDM} myNotes={m.myNotes} hooks={m.hooks} titleOf={m.titleOf} status={m.notesStatus} />
          </div>
        </div>
      </div>
    </div>
  )
}
