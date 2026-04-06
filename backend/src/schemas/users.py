from pydantic import BaseModel, EmailStr, Field, field_validator


class UserBase(BaseModel):
    username: str = Field(..., min_length=2, max_length=50, description="Username of the user")
    email: EmailStr = Field(..., description="Email of the user")


class UserRequestAdd(UserBase):
    password: str = Field(..., min_length=8, max_length=128, description="Password of the user raw")

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not any(c.isalpha() for c in v):
            raise ValueError("Password must contain at least one letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


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
