import AuthWrapper from "~components/auth-wrapper"
import Meetings from "~components/meetings"

function IndexPage() {
  return (
    <AuthWrapper>
      {(logoutFn) => <Meetings onLogout={logoutFn} />}
    </AuthWrapper>
  )
}

export default IndexPage