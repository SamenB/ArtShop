"""
Pydantic schemas for user data validation and authentication.
"""
from pydantic import BaseModel, EmailStr, Field, field_validator


class UserBase(BaseModel):
    """
    Base schema for user-related data.
    """
    username: str = Field(..., min_length=2, max_length=50, description="Username of the user")
    email: EmailStr = Field(..., description="Email of the user")


class UserRequestAdd(UserBase):
    """
    Schema for the initial user registration request.
    Includes raw password for validation.
    """
    password: str = Field(..., min_length=8, max_length=128, description="Password of the user raw")

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """
        Custom validator to ensure password complexity.
        Requires at least one letter and one digit.
        """
        if not any(c.isalpha() for c in v):
            raise ValueError("Password must contain at least one letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


class UserAdd(UserBase):
    """
    Schema for creating a user record in the database with a hashed password.
    """
    hashed_password: str = Field(..., description="Hashed password of the user")


class User(UserBase):
    """
    Represents a full user entity retrieved from the database.
    """
    id: int = Field(..., description="ID of the user")
    is_admin: bool = Field(False, description="Is the user an admin")


class UserLogin(BaseModel):
    """
    Schema for traditional email/password login requests.
    """
    email: EmailStr = Field(..., description="Email of the user")
    password: str = Field(..., description="Password of the user raw")


class GoogleLoginRequest(BaseModel):
    """
    Schema for Google OAuth2 login requests containing an ID Token.
    """
    token: str = Field(..., description="Google ID Token")
