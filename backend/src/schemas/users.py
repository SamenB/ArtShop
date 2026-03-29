from pydantic import BaseModel, EmailStr, Field


class UserBase(BaseModel):
    username: str = Field(..., description="Username of the user")
    email: EmailStr = Field(..., description="Email of the user")


class UserRequestAdd(UserBase):
    password: str = Field(..., description="Password of the user raw")


class UserAdd(UserBase):
    hashed_password: str = Field(..., description="Hashed password of the user")


class User(UserBase):
    id: int = Field(..., description="ID of the user")
    is_admin: bool = Field(False, description="Is the user an admin")


class UserLogin(BaseModel):
    email: EmailStr = Field(..., description="Email of the user")
    password: str = Field(..., description="Password of the user raw")


class GoogleLoginRequest(BaseModel):
    token: str = Field(..., description="Google ID Token")
