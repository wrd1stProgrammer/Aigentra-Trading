from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.password_accounts import (
    InvalidPasswordAccountCredentials,
    InvalidPasswordAccountInput,
    PasswordAccountAlreadyExists,
    PasswordAccountView,
    authenticate_password_account,
    create_password_account,
)
from app.subscribers_routes import require_subscriber_api_token


router = APIRouter(prefix="/api/auth/password", tags=["password-auth"])


class PasswordSignupPayload(BaseModel):
    name: str = Field(default="", max_length=120)
    email: str = Field(min_length=3, max_length=240)
    password: str = Field(min_length=1, max_length=200)


class PasswordLoginPayload(BaseModel):
    email: str = Field(min_length=3, max_length=240)
    password: str = Field(min_length=1, max_length=200)


class PasswordAccountResponse(BaseModel):
    userId: str
    email: str
    name: str


@router.post("/signup", response_model=PasswordAccountResponse, status_code=201)
def signup_password_account(
    payload: PasswordSignupPayload,
    _: None = Depends(require_subscriber_api_token),
    db: Session = Depends(get_db),
) -> PasswordAccountResponse:
    try:
        account = create_password_account(db, name=payload.name, email=payload.email, password=payload.password)
        db.commit()
    except PasswordAccountAlreadyExists as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except InvalidPasswordAccountInput as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return password_account_response(account)


@router.post("/login", response_model=PasswordAccountResponse)
def login_password_account(
    payload: PasswordLoginPayload,
    _: None = Depends(require_subscriber_api_token),
    db: Session = Depends(get_db),
) -> PasswordAccountResponse:
    try:
        account = authenticate_password_account(db, email=payload.email, password=payload.password)
        db.commit()
    except InvalidPasswordAccountCredentials as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except InvalidPasswordAccountInput as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return password_account_response(account)


def password_account_response(account: PasswordAccountView) -> PasswordAccountResponse:
    return PasswordAccountResponse(userId=account.user_id, email=account.email, name=account.name)
