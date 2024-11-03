import AuthWrapper from "~components/auth-wrapper"
import Meetings from "~components/meetings"

function IndexPage() {
  return (
    <AuthWrapper>
      <Meetings />
    </AuthWrapper>
  )
}

export default IndexPage