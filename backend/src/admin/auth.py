from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request
from sqlalchemy import select

from starlette.responses import RedirectResponse
from src.services.auth import AuthService
from src.database import new_session
from src.models.users import UsersOrm
from src.config import settings


class AdminAuth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        form = await request.form()
        email, password = form["username"], form["password"]

        auth_service = AuthService()
        
        async with new_session() as session:
            query = select(UsersOrm).filter_by(email=email)
            result = await session.execute(query)
            user = result.scalar_one_or_none()

            if not user:
                return False
            
            if not auth_service.verify_password(password, user.hashed_password):
                 return False

            if user.email not in settings.ADMIN_EMAILS:
                return False

            request.session.update({"token": "admin_token", "user_id": user.id})
            return True

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        token = request.session.get("token")
        if not token:
            return False
        return True


authentication_backend = AdminAuth(secret_key=settings.JWT_SECRET_KEY)
