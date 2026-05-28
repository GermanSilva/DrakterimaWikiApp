import LazyImg from './LazyImg'

export default function WikiImage({ url }) {
  if (!url) return null
  return (
    <LazyImg
      src={url}
      alt=""
      className="max-w-full h-auto block mx-auto"
      containerCls="min-h-[120px]"
    />
  )
}
