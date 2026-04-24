const calcCharJaccard = (a, b) => {
  if (!a || !b) return 0
  const setA = new Set(a.split(""))
  const setB = new Set(b.split(""))
  const intersection = [...setA].filter((ch) => setB.has(ch)).length
  const union = new Set([...setA, ...setB]).size
  if (union === 0) return 0
  return intersection / union
}

console.log('calcCharJaccard: ', calcCharJaccard("李子坝轻轨站", "李子坝站"))